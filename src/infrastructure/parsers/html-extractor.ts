/**
 * HtmlExtractor — port + linkedom/@mozilla/readability adapter.
 *
 * The port takes raw HTML and a source URL and returns a clean
 * article structure: title, byline, main-text, excerpt. The adapter
 * uses linkedom (SSR-optimized DOM) to walk the markup and Mozilla's
 * Readability (the engine behind Firefox Reader View) to find the
 * main content.
 *
 * Readability expects a DOM object that implements a subset of the
 * W3C DOM spec. linkedom's `parseHTML` returns exactly that subset
 * and is 10× lighter than jsdom — which matters here because we'll
 * call this once per fetched article, not once per test run.
 *
 * The extract call returns a ResultAsync because both dependencies
 * are dynamically imported on first use — this keeps cold-start
 * cheap for CLI commands that never parse HTML.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { GraphError } from '../../domain/errors.js';

/** The output of a successful extraction. */
export interface ExtractedArticle {
  /** Page title if present. */
  readonly title: string;
  /** Plain text of the main content, HTML stripped. */
  readonly text: string;
  /** Short excerpt (summary) if Readability provides one. */
  readonly excerpt?: string;
  /** Author/byline if detected. */
  readonly byline?: string;
  /** Site name (og:site_name) if available. */
  readonly site?: string;
  /** Word count Readability reports. */
  readonly length?: number;
}

/** Port. */
export interface HtmlExtractor {
  extract(html: string, url: string): ResultAsync<ExtractedArticle, GraphError>;
}

/**
 * Build the default HtmlExtractor.
 *
 * linkedom and @mozilla/readability are imported lazily on the first
 * extraction so CLI commands that never parse HTML don't pay the
 * module-load cost. We cache the loaded modules after the first call.
 */
export const readabilityExtractor = (): HtmlExtractor => {
  type LinkedomModule = { parseHTML: (html: string) => { document: object } };
  type ReadabilityModule = {
    Readability: new (
      doc: object,
      opts?: { debug?: boolean },
    ) => {
      parse(): {
        title?: string;
        textContent?: string;
        excerpt?: string;
        byline?: string;
        siteName?: string;
        length?: number;
      } | null;
    };
  };

  let cache: { linkedom: LinkedomModule; readability: ReadabilityModule } | null = null;

  const loadDeps = (): ResultAsync<
    { linkedom: LinkedomModule; readability: ReadabilityModule },
    GraphError
  > => {
    if (cache !== null) return okAsync(cache);
    return ResultAsync.fromPromise(
      (async () => {
        const [linkedom, readability] = await Promise.all([
          import('linkedom') as unknown as Promise<LinkedomModule>,
          import('@mozilla/readability') as unknown as Promise<ReadabilityModule>,
        ]);
        cache = { linkedom, readability };
        return cache;
      })(),
      (e) => GraphError.parseError('<html>', `failed to load extractor deps: ${(e as Error).message}`),
    );
  };

  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const extract = (html: string, url: string): ResultAsync<ExtractedArticle, GraphError> =>
    loadDeps().andThen(({ linkedom, readability }) => {
      try {
        // For non-HTML content (markdown, plain text), wrap in minimal HTML so
        // Readability can extract the text. Detects by checking for a leading
        // HTML tag or doctype — if absent, wraps as a <pre> block inside a
        // proper document structure. This lets file:// markdown sources work.
        const looksLikeHtml = /^\s*(<[!a-z])/i.test(html);
        const wrappedHtml = looksLikeHtml
          ? html
          : `<!DOCTYPE html><html><head><title>${esc(url)}</title></head><body><article><pre>${esc(html)}</pre></article></body></html>`;

        const dom = linkedom.parseHTML(wrappedHtml);
        const reader = new readability.Readability(dom.document, { debug: false });
        const parsed = reader.parse();
        if (!parsed) {
          return errAsync(
            GraphError.parseError(
              url,
              'readability returned null — page had no extractable article',
            ),
          );
        }
        const text = (parsed.textContent ?? '').trim();
        if (text.length === 0) {
          return errAsync(GraphError.parseError(url, 'readability returned empty textContent'));
        }
        const result: ExtractedArticle = {
          title: (parsed.title ?? '').trim(),
          text,
          excerpt: parsed.excerpt ?? undefined,
          byline: parsed.byline ?? undefined,
          site: parsed.siteName ?? undefined,
          length: parsed.length,
        };
        return okAsync(result);
      } catch (e) {
        return errAsync(GraphError.parseError(url, `extraction failed: ${(e as Error).message}`));
      }
    });

  return { extract };
};
