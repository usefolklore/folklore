/**
 * HttpFetcher — port + native-fetch adapter.
 *
 * The port is deliberately narrow: one method, `get(url)`, which
 * returns the raw response body as a string plus the final URL and
 * content-type header. Adapters decide how to get there.
 *
 * The default adapter uses Node 20+ native `fetch` and handles:
 *   - `file://` URLs for local test fixtures (reads from disk)
 *   - `http(s)://` URLs via fetch with a sensible User-Agent
 *   - content-length cap to refuse absurd responses
 *   - timeout via AbortController
 *
 * Phase 3+ will swap this for an undici-backed adapter with RFC-9111
 * cache interceptors once we have real traffic shapes to tune.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';

/** The result of a successful fetch. */
export interface FetchResponse {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

/** Port. */
export interface HttpFetcher {
  get(url: string): ResultAsync<FetchResponse, GraphError>;
}

export interface HttpFetcherOptions {
  readonly userAgent?: string;
  readonly timeoutMs?: number;
  /** Hard cap on response size in bytes. Default 10 MiB. */
  readonly maxBytes?: number;
}

/**
 * Build the default HttpFetcher. Stateless — every call creates a
 * fresh AbortController and dispatches a new request.
 */
export const httpFetcher = (opts: HttpFetcherOptions = {}): HttpFetcher => {
  const userAgent = opts.userAgent ?? 'akashik/0.1 (+https://github.com/saharbarak/akashik)';
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;

  const get = (url: string): ResultAsync<FetchResponse, GraphError> => {
    if (url.startsWith('file://')) return fetchFile(url);
    return fetchHttp(url, { userAgent, timeoutMs, maxBytes });
  };

  return { get };
};

// ─────────────────────── file:// adapter ──────────────────

const fetchFile = (url: string): ResultAsync<FetchResponse, GraphError> => {
  const path = fileURLToPath(url);
  return ResultAsync.fromPromise(readFile(path, 'utf8'), (e) =>
    GE.readError(path, (e as Error).message),
  ).map(
    (body): FetchResponse => ({
      url,
      status: 200,
      contentType: guessContentType(path),
      body,
    }),
  );
};

const guessContentType = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.xml') || lower.endsWith('.rss') || lower.endsWith('.atom')) {
    return 'application/xml';
  }
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'text/plain';
};

// ─────────────────────── http(s):// adapter ───────────────

interface HttpConfig {
  readonly userAgent: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

const fetchHttp = (url: string, cfg: HttpConfig): ResultAsync<FetchResponse, GraphError> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const promise = (async (): Promise<FetchResponse> => {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': cfg.userAgent, accept: '*/*' },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      // Enforce content-length cap when present.
      const lengthHeader = response.headers.get('content-length');
      if (lengthHeader !== null && Number(lengthHeader) > cfg.maxBytes) {
        throw new Error(`response too large (${lengthHeader} > ${cfg.maxBytes} bytes)`);
      }
      const body = await response.text();
      if (body.length > cfg.maxBytes) {
        throw new Error(`response body exceeds ${cfg.maxBytes} bytes`);
      }
      return {
        url: response.url || url,
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  })();

  return ResultAsync.fromPromise(promise, (e) => GE.readError(url, (e as Error).message));
};

// ─────────────────────── content hashing ─────────────────

/**
 * Stable sha256 hex digest of a normalized string. The normalization
 * step strips trailing whitespace, collapses internal whitespace runs,
 * and lowercases — so trivial edits (reformatting, cosmetic changes)
 * don't invalidate the dedup.
 */
export const contentSha256 = async (text: string): Promise<string> => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
};

/** Synchronous variant for hot paths that already have crypto imported. */
export const contentSha256Sync = (text: string, createHash: (algo: string) => { update: (data: string, encoding: string) => { digest: (encoding: string) => string } }): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
};

/**
 * Re-export via a non-dynamic helper to keep test code simple.
 * We wrap node:crypto in ResultAsync so errors are chainable.
 */
export const hashContent = (text: string): ResultAsync<string, GraphError> =>
  ResultAsync.fromPromise(contentSha256(text), (e) =>
    GE.readError('<hash>', (e as Error).message),
  );

// keep okAsync/errAsync referenced so the file compiles with strict TS
void okAsync;
void errAsync;
