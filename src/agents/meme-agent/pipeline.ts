/**
 * Meme-agent pipeline (AGENT-01): generate → (gated) post → append.
 *
 * DRY-RUN by default. The X post step is reached ONLY when
 * `!config.dryRun` AND `X_CLIENT_ID` is set; otherwise the live call is
 * skipped entirely and the agent makes ZERO network posts. The post
 * step reuses src/infrastructure/x-client.ts (postTweet) — there is no
 * second OAuth implementation here.
 *
 * Functional DDD: no classes, neverthrow Results, ESM .js suffixes.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import { postTweet, type XClientConfig } from '../../infrastructure/x-client.js';
import { generateMeme } from './generate.js';
import type { MemeAgentConfig, MemeEntry } from './types.js';

/** Read the existing memes.json array, or [] when absent / unparseable-as-array. */
const readMemes = (memesPath: string): MemeEntry[] => {
  if (!existsSync(memesPath)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(memesPath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as MemeEntry[]) : [];
  } catch {
    return [];
  }
};

/** Append one entry to memes.json (atomic-ish: write tmp then rename). */
const appendMeme = (memesPath: string, entry: MemeEntry): ResultAsync<MemeEntry, AppError> => {
  try {
    const all = [...readMemes(memesPath), entry];
    const tmp = `${memesPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n', 'utf8');
    renameSync(tmp, memesPath);
    return okAsync(entry);
  } catch (e) {
    return ResultAsync.fromPromise(
      Promise.reject(GE.writeError(memesPath, (e as Error).message)),
      (err) => err as AppError,
    );
  }
};

/**
 * Post the caption to X — reuses x-client.postTweet. Returns the entry
 * with `postedUrl` set on success, or the bare entry if anything fails
 * (a failed post must NOT drop the locally-generated meme).
 */
const postStep = (config: MemeAgentConfig, entry: MemeEntry): ResultAsync<MemeEntry, AppError> => {
  const clientId = process.env.X_CLIENT_ID;
  // Gate: dry-run OR missing creds → skip the live call entirely.
  if (config.dryRun || !clientId) {
    console.log(`[dry-run] would post: ${entry.caption}`);
    return okAsync(entry);
  }
  const cfg: XClientConfig = {
    clientId,
    clientSecret: process.env.X_CLIENT_SECRET,
    homePath: join(homedir(), '.folklore'),
  };
  return postTweet(cfg, entry.caption)
    .map((post): MemeEntry => ({ ...entry, postedUrl: post.url }))
    .orElse(() => okAsync(entry)); // never lose the meme on a post failure
};

/**
 * Run the full pipeline for one invocation. generate → (gated) post →
 * append. Returns the final MemeEntry (with postedUrl iff live-posted).
 */
export const runMemeAgent = (config: MemeAgentConfig): ResultAsync<MemeEntry, AppError> => {
  const memesPath = join(config.siteAssetsDir, 'memes.json');
  // 1. generate — higgsfield path falls back to SVG on Err.
  const generated: ResultAsync<MemeEntry, AppError> = generateMeme(config).orElse((err) =>
    config.useHiggsfield
      ? generateMeme({ ...config, useHiggsfield: false }).mapErr((e): AppError => e)
      : ResultAsync.fromPromise(Promise.reject(err), (e) => e as AppError),
  );
  return generated
    .andThen((entry) => postStep(config, entry))
    .andThen((entry) => appendMeme(memesPath, entry));
};
