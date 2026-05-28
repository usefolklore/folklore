/**
 * Inbound capture — URL → ingest into global graph.
 *
 * V5: no room classification. When a user forwards a URL:
 *   1. Fetch + parse via the generic HTTP + HTML pipeline
 *   2. Ingest into the global graph via indexNode (no room tag)
 *   3. Reply with a summary
 *
 * Privacy: captures land with `private: false` by default — Telegram is
 * a sharing surface (forwarded URLs are de-facto public). The
 * multi-tier privacy work (per-recipient sharing) is deferred; for
 * sensitive captures the user should mark the resulting node private
 * via `akashik save --private` after the fact.
 */

import { formatError } from '../domain/errors.js';
import { indexNode } from '../application/use-cases.js';
import type { Runtime } from '../cli/runtime.js';

export const handleCapture = async (
  runtime: Runtime,
  urls: string[],
  _messageText: string,
): Promise<string> => {
  void _messageText;
  const results: string[] = [];
  const useCase = indexNode({
    graphs: runtime.graphs,
    vectors: runtime.vectors,
    embedder: runtime.embedder,
    githubUser: runtime.githubUser,
  });

  for (const url of urls.slice(0, 3)) { // max 3 URLs per message
    const fetchResult = await runtime.http.get(url);
    if (fetchResult.isErr()) {
      results.push(`Failed: ${url} — ${formatError(fetchResult.error)}`);
      continue;
    }

    const htmlResult = await runtime.html.extract(fetchResult.value.body, url);
    if (htmlResult.isErr()) {
      results.push(`Failed to extract: ${url}`);
      continue;
    }

    const article = htmlResult.value;
    const node = {
      id: url,
      label: article.title || url,
      file_type: 'document' as const,
      source_file: url,
      source_uri: url,
      fetched_at: new Date().toISOString(),
      private: false,
    };

    const indexResult = await useCase({
      node,
      text: article.text,
    });

    if (indexResult.isOk()) {
      results.push(`Indexed: *${article.title || url}*`);
    } else {
      results.push(`Failed to index: ${url}`);
    }
  }

  return results.join('\n') || 'No URLs processed.';
};
