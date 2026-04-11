/**
 * `wellinformed publish <sub>`
 *
 * Subcommands:
 *   auth               authenticate with X/Twitter via OAuth 2.0
 *   tweet "<text>"      post a single tweet
 *   thread <file>       post a thread from a markdown file (## = thread separator)
 *   launch             post the pre-written launch thread from docs/marketing/x-launch-posts.md
 *   preview <file>      show what would be posted without posting
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { postTweet, postThread, type XClientConfig } from '../../infrastructure/x-client.js';
import { runtimePaths } from '../runtime.js';

const getConfig = (): XClientConfig | string => {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) return 'X_CLIENT_ID env var not set. Get one at https://developer.x.com/en/portal/dashboard';
  return {
    clientId,
    clientSecret: process.env.X_CLIENT_SECRET,
    homePath: runtimePaths().home,
  };
};

// ─────────────── thread parsing ─────────

/**
 * Parse a markdown file into thread posts. Each ## heading starts
 * a new post. Content between headings becomes the tweet text.
 * Lines starting with **Post N:** are treated as tweet boundaries.
 */
const parseThreadFile = (content: string): string[] => {
  const posts: string[] = [];
  const lines = content.split('\n');
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // New post boundary: **Post N:** pattern
    if (/^\*\*Post \d+/.test(trimmed)) {
      if (current.trim()) posts.push(current.trim());
      // Strip the **Post N (hook):** prefix
      current = trimmed.replace(/^\*\*Post \d+[^:]*:\*\*\s*/, '');
      continue;
    }
    // Skip markdown headers and separators
    if (/^#{1,3}\s/.test(trimmed) || trimmed === '---') {
      if (current.trim()) posts.push(current.trim());
      current = '';
      continue;
    }
    if (trimmed.length > 0) {
      current += (current ? '\n' : '') + trimmed;
    }
  }
  if (current.trim()) posts.push(current.trim());

  // Filter to posts that fit in a tweet (280 chars) or split
  return posts
    .filter((p) => p.length > 0)
    .map((p) => (p.length > 280 ? p.slice(0, 277) + '...' : p));
};

// ─────────────── subcommands ────────────

const auth = async (): Promise<number> => {
  const cfg = getConfig();
  if (typeof cfg === 'string') { console.error(`publish auth: ${cfg}`); return 1; }
  // Import and trigger authentication
  const { postTweet: _ } = await import('../../infrastructure/x-client.js');
  // Just triggering getAuthenticatedClient via a dry call
  console.log('Starting OAuth 2.0 PKCE flow...');
  const result = await postTweet(cfg, ''); // will fail with empty text but auth happens first
  // If we get here, auth worked (even if tweet failed)
  if (existsSync(join(cfg.homePath, 'x-token.json'))) {
    console.log('Authenticated successfully. Token saved.');
    return 0;
  }
  if (result.isErr()) {
    // Check if it's an auth error vs tweet error
    if (formatError(result.error).includes('authenticate')) {
      console.error(`publish auth: ${formatError(result.error)}`);
      return 1;
    }
    console.log('Authenticated successfully (empty tweet rejected as expected).');
    return 0;
  }
  return 0;
};

const tweet = async (text: string): Promise<number> => {
  const cfg = getConfig();
  if (typeof cfg === 'string') { console.error(`publish tweet: ${cfg}`); return 1; }
  if (!text) { console.error('publish tweet: missing text'); return 1; }

  console.log(`Posting: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);
  const result = await postTweet(cfg, text);
  if (result.isErr()) {
    console.error(`publish tweet: ${formatError(result.error)}`);
    return 1;
  }
  console.log(`Posted: ${result.value.url}`);
  return 0;
};

const thread = async (filePath: string): Promise<number> => {
  const cfg = getConfig();
  if (typeof cfg === 'string') { console.error(`publish thread: ${cfg}`); return 1; }

  if (!existsSync(filePath)) {
    console.error(`publish thread: file not found: ${filePath}`);
    return 1;
  }
  const content = readFileSync(filePath, 'utf8');
  const posts = parseThreadFile(content);

  if (posts.length === 0) {
    console.error('publish thread: no posts parsed from file');
    return 1;
  }

  console.log(`Posting thread: ${posts.length} tweets\n`);
  for (let i = 0; i < posts.length; i++) {
    console.log(`  [${i + 1}/${posts.length}] ${posts[i].slice(0, 60)}...`);
  }
  console.log('');

  const result = await postThread(cfg, posts);
  if (result.isErr()) {
    console.error(`publish thread: ${formatError(result.error)}`);
    return 1;
  }
  console.log('Thread posted:');
  for (const r of result.value) {
    console.log(`  ${r.url}`);
  }
  return 0;
};

const launch = async (): Promise<number> => {
  const launchFile = join(process.cwd(), 'docs', 'marketing', 'x-launch-posts.md');
  if (!existsSync(launchFile)) {
    console.error(`publish launch: ${launchFile} not found`);
    return 1;
  }
  return thread(launchFile);
};

const preview = async (filePath: string): Promise<number> => {
  if (!existsSync(filePath)) {
    console.error(`publish preview: file not found: ${filePath}`);
    return 1;
  }
  const content = readFileSync(filePath, 'utf8');
  const posts = parseThreadFile(content);

  console.log(`Preview: ${posts.length} tweets\n`);
  for (let i = 0; i < posts.length; i++) {
    const chars = posts[i].length;
    const status = chars <= 280 ? `${chars}/280` : `${chars}/280 OVER`;
    console.log(`--- Tweet ${i + 1} (${status}) ---`);
    console.log(posts[i]);
    console.log('');
  }
  return 0;
};

// ─────────────── entry ──────────────────

export const publish = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'auth': return auth();
    case 'tweet': return tweet(rest.join(' '));
    case 'thread': return thread(rest[0] ?? '');
    case 'launch': return launch();
    case 'preview': return preview(rest[0] ?? join(process.cwd(), 'docs', 'marketing', 'x-launch-posts.md'));
    default:
      console.error(`publish: unknown subcommand '${sub ?? ''}'. try: auth | tweet | thread | launch | preview`);
      return 1;
  }
};
