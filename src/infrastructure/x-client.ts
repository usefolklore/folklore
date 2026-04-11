/**
 * X/Twitter client — OAuth 2.0 PKCE + tweet posting.
 *
 * Uses twitter-api-v2 (1.5K stars, last commit Jan 2026).
 * OAuth flow: opens browser for auth, stores token at
 * ~/.wellinformed/x-token.json, refreshes automatically.
 *
 * No credentials are hardcoded. X_CLIENT_ID must be set as env var
 * or passed in config. Client secret is optional for public clients.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { ResultAsync } from 'neverthrow';
import { TwitterApi } from 'twitter-api-v2';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';

const TOKEN_FILE = 'x-token.json';
const CALLBACK_URL = 'http://127.0.0.1:8787/callback';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

export interface XClientConfig {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly homePath: string;
}

interface StoredToken {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}

// ─────────────── token storage ──────────

const tokenPath = (homePath: string): string => join(homePath, TOKEN_FILE);

const loadToken = (homePath: string): StoredToken | null => {
  const p = tokenPath(homePath);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StoredToken;
  } catch {
    return null;
  }
};

const saveToken = (homePath: string, token: StoredToken): void => {
  mkdirSync(homePath, { recursive: true });
  writeFileSync(tokenPath(homePath), JSON.stringify(token, null, 2));
};

// ─────────────── OAuth 2.0 PKCE ─────────

const authenticate = async (cfg: XClientConfig): Promise<StoredToken> => {
  const client = new TwitterApi({ clientId: cfg.clientId, clientSecret: cfg.clientSecret });
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(CALLBACK_URL, {
    scope: SCOPES,
  });

  console.log('\nOpen this URL in your browser to authorize wellinformed:\n');
  console.log(`  ${url}\n`);

  // Try to open browser automatically
  try {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} "${url}"`);
  } catch { /* manual open */ }

  // Wait for OAuth callback
  return new Promise<StoredToken>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? '', `http://localhost:8787`);
      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');

      if (!code || returnedState !== state) {
        res.writeHead(400);
        res.end('Authorization failed — state mismatch or missing code.');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }

      try {
        const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
          code,
          codeVerifier,
          redirectUri: CALLBACK_URL,
        });

        const token: StoredToken = {
          accessToken,
          refreshToken,
          expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
        };
        saveToken(cfg.homePath, token);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>wellinformed authorized. You can close this tab.</h2>');
        server.close();
        resolve(token);
      } catch (e) {
        res.writeHead(500);
        res.end('Token exchange failed.');
        server.close();
        reject(e);
      }
    });

    server.listen(8787, () => {
      console.log('Waiting for authorization callback on http://127.0.0.1:8787 ...');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout — no callback received within 120 seconds'));
    }, 120_000);
  });
};

// ─────────────── client factory ─────────

const getAuthenticatedClient = async (cfg: XClientConfig): Promise<TwitterApi> => {
  let token = loadToken(cfg.homePath);

  if (!token) {
    token = await authenticate(cfg);
  }

  // Check if token is expired and refresh
  if (token.expiresAt && Date.now() > token.expiresAt && token.refreshToken) {
    const client = new TwitterApi({ clientId: cfg.clientId, clientSecret: cfg.clientSecret });
    try {
      const { accessToken, refreshToken, expiresIn } = await client.refreshOAuth2Token(token.refreshToken);
      token = {
        accessToken,
        refreshToken,
        expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
      };
      saveToken(cfg.homePath, token);
    } catch {
      // Refresh failed — re-authenticate
      token = await authenticate(cfg);
    }
  }

  return new TwitterApi(token.accessToken);
};

// ─────────────── posting ────────────────

export interface PostResult {
  readonly id: string;
  readonly text: string;
  readonly url: string;
}

/**
 * Post a single tweet. Returns the tweet ID and URL.
 */
export const postTweet = (
  cfg: XClientConfig,
  text: string,
): ResultAsync<PostResult, GraphError> =>
  ResultAsync.fromPromise(
    (async (): Promise<PostResult> => {
      const client = await getAuthenticatedClient(cfg);
      const { data } = await client.v2.tweet(text);
      return {
        id: data.id,
        text,
        url: `https://x.com/i/status/${data.id}`,
      };
    })(),
    (e) => GE.writeError('x-api', (e as Error).message),
  );

/**
 * Post a thread (array of tweets, each replying to the previous).
 */
export const postThread = (
  cfg: XClientConfig,
  tweets: readonly string[],
): ResultAsync<readonly PostResult[], GraphError> =>
  ResultAsync.fromPromise(
    (async (): Promise<PostResult[]> => {
      const client = await getAuthenticatedClient(cfg);
      const results: PostResult[] = [];
      let replyToId: string | undefined;

      for (const text of tweets) {
        const { data } = await client.v2.tweet(
          text,
          replyToId ? { reply: { in_reply_to_tweet_id: replyToId } } : undefined,
        );
        results.push({
          id: data.id,
          text,
          url: `https://x.com/i/status/${data.id}`,
        });
        replyToId = data.id;
      }
      return results;
    })(),
    (e) => GE.writeError('x-api', (e as Error).message),
  );
