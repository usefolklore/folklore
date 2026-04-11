/**
 * product_hunt source adapter.
 *
 * Fetches Product Hunt posts via the public Atom feed at
 * https://www.producthunt.com/feed.atom — no API key needed.
 *
 * Config shape:
 *   {
 *     max_items?: number      // default 20
 *   }
 *
 * The Atom feed is XML. We do minimal parsing with regex/string
 * matching to extract <entry> elements — no heavy XML lib required.
 * Each entry becomes a ContentItem.
 *
 * Stable URI for dedup: the <id> or <link href="..."> of each entry.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface ProductHuntConfig {
  readonly max_items?: number;
}

interface AtomEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly link: string;
  readonly author: string;
  readonly published: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): ProductHuntConfig => ({
  max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
});

const FEED_URL = 'https://www.producthunt.com/feed.atom';

/** Extract text content between an XML open/close tag. */
const extractTag = (xml: string, tag: string): string => {
  const open = `<${tag}`;
  const start = xml.indexOf(open);
  if (start === -1) return '';
  const closeAngle = xml.indexOf('>', start);
  if (closeAngle === -1) return '';
  const end = xml.indexOf(`</${tag}>`, closeAngle);
  if (end === -1) return '';
  return xml.slice(closeAngle + 1, end).trim();
};

/** Extract href attribute from a <link> tag. */
const extractLinkHref = (xml: string): string => {
  const match = xml.match(/<link[^>]+href="([^"]+)"/);
  return match ? match[1] : '';
};

/** Extract author name from <author><name>...</name></author>. */
const extractAuthor = (xml: string): string => {
  const authorBlock = extractTag(xml, 'author');
  if (!authorBlock) return '';
  return extractTag(authorBlock, 'name');
};

const parseEntries = (body: string, url: string): ResultAsync<readonly AtomEntry[], GraphError> => {
  try {
    const entries: AtomEntry[] = [];
    let searchFrom = 0;
    while (true) {
      const entryStart = body.indexOf('<entry>', searchFrom);
      if (entryStart === -1) break;
      const entryEnd = body.indexOf('</entry>', entryStart);
      if (entryEnd === -1) break;
      const entryXml = body.slice(entryStart, entryEnd + '</entry>'.length);
      searchFrom = entryEnd + '</entry>'.length;

      const id = extractTag(entryXml, 'id');
      const title = extractTag(entryXml, 'title');
      if (!title) continue;

      entries.push({
        id: id || extractLinkHref(entryXml),
        title,
        summary: extractTag(entryXml, 'summary') || extractTag(entryXml, 'content') || title,
        link: extractLinkHref(entryXml),
        author: extractAuthor(entryXml),
        published: extractTag(entryXml, 'published') || extractTag(entryXml, 'updated'),
      });
    }
    if (entries.length === 0) {
      return errAsync(GE.parseError(url, 'no <entry> elements found in Atom feed'));
    }
    return okAsync(entries);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const entryToItem = (entry: AtomEntry): ContentItem | null => {
  const sourceUri = entry.link || entry.id;
  if (!sourceUri) return null;
  return {
    source_uri: sourceUri,
    title: entry.title,
    text: entry.summary,
    published_at: entry.published || undefined,
    author: entry.author || undefined,
    metadata: {
      kind: 'product_hunt',
      atom_id: entry.id,
    },
  };
};

export interface ProductHuntDeps {
  readonly http: HttpFetcher;
}

export const productHuntSource = (deps: ProductHuntDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(FEED_URL)
        .mapErr((e): AppError => e)
        .andThen((response) => parseEntries(response.body, FEED_URL).mapErr((e): AppError => e))
        .map((entries): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const entry of entries) {
            const item = entryToItem(entry);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
